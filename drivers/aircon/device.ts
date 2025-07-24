import Homey from 'homey';
import { MyDriver } from './driver';
import { Power, Parameters, OperationMode, EcoMode, AirSwingLR, AirSwingUD, FanAutoMode, FanSpeed, NanoeMode, Device, ComfortCloudClient } from 'panasonic-comfort-cloud-client';
import { Mutex } from 'async-mutex';

function getParam(value:any, transform: (v:any) => any) : any {
  if (value === undefined)
    return undefined;
  return transform(value);
}

export class MyDevice extends Homey.Device {

  id: string = this.getData().id;
  driver: MyDriver = this.driver as MyDriver;
  timer: NodeJS.Timer|null = null; 
  alwaysOn: boolean = false;
  fetchMutex:Mutex = new Mutex();

  async setCap<T>(name:string, value:T) {
    // Try adding the capability if it does not exist
    if (!this.hasCapability(name)) {
      this.addCapability(name);
    }
    let current = this.getCapabilityValue(name);
    if (value == current)
      return;
    this.log("setCapabilityValue("+name+", "+value+")");
    if (value === undefined)
      return;
    await this.setCapabilityValue(name, value);
  }

  // Getting the timezone offset in minutes
  getOffset(timeZone: any = 'UTC', date: any = new Date()) {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    return (tzDate.getTime() - utcDate.getTime()) / 6e4;
  }
  
  // Converting the offset minutes to hours in the format "+01:00"
  minutesToHours(minutes: any) {
    const positive = minutes >= 0;
    minutes = Math.abs(minutes);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${positive ? '+' : '-'}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  // Fetch the last hour's power consumption in watts
  // This will register the consumption with one hour delay, as the last hour is not complete yet.
  async fetchLastHourWattsConsumption(client: ComfortCloudClient, device: Device | null) {
    if (!device)
      return;

    // If the device is OFF, power consumption should be 0
    if (device.operate !== Power.On) {
      this.setCap('measure_power', 0);
      return;
    }

    // Get the timezone offset in the format "+01:00" with Europe/Oslo as default (Change this to some other default?)
    let timeZone = this.minutesToHours(this.getOffset(this.homey.clock.getTimezone() || 'Europe/Oslo')) || '+01:00';

    // Get today's history data for the device
    let historyData = await client.getDeviceHistoryData(device.guid, new Date(), 0, timeZone);
    
    // Filter out the -255 values, which are used to indicate hours that has not passed yet in the current day
    let historyWithData = historyData.historyDataList.filter((i: any) => i.consumption != -255);

    // Get the consumption from the second last hour (the last hour is not complete yet)
    let consumption = historyWithData?.[historyWithData?.length - 2]?.consumption;

    // Debug logging to understand what the API is returning
    this.log("Device ON/OFF state:", device.operate === Power.On ? "ON" : "OFF");
    this.log("API consumption data (kWh):", consumption);
    this.log("Available history hours:", historyWithData.length);
    if (historyWithData.length > 0) {
      this.log("Last few hours consumption:", historyWithData.slice(-3).map((h: any) => h.consumption));
    }

    // Set the measure_power capability to the consumption in watts instead of kilowatts
    // But only if we have valid consumption data, otherwise set to 0
    if (consumption !== undefined && consumption > 0) {
      this.setCap('measure_power', consumption * 1000);
      this.log("Setting power to:", consumption * 1000, "W");
    } else {
      this.setCap('measure_power', 0);
      this.log("Setting power to: 0 W (no valid consumption data)");
    }
    
    // Update cumulative energy consumption for meter_power (kWh)
    // Only add new hourly consumption data that hasn't been processed yet
    const processedHours = this.getStoreValue('processedHours') || [];
    const lastMeterValue = this.getStoreValue('lastMeterValue') || 0;
    
    let newConsumption = 0;
    let newProcessedHours = [...processedHours];
    const today = new Date().toDateString();
    
    // Process each hour's data and only add consumption for hours we haven't processed yet
    for (let i = 0; i < historyWithData.length; i++) {
      const hourData = historyWithData[i];
      const hourKey = `${today}-${i}`;
      
      if (!processedHours.includes(hourKey) && hourData.consumption > 0) {
        newConsumption += hourData.consumption;
        newProcessedHours.push(hourKey);
      }
    }
    
    // Update meter_power and store processed hours if we have new consumption
    if (newConsumption > 0) {
      const newMeterValue = lastMeterValue + newConsumption;
      this.setCap('meter_power', newMeterValue);
      
      // Store the updated state in device data
      this.setStoreValue('processedHours', newProcessedHours);
      this.setStoreValue('lastMeterValue', newMeterValue);
    }
  }
  
  async fetchFromService(forced:boolean) {
    // this.log("fetchFromService("+forced+")");
    let device:Device|null;
    try {
      device = await this.driver.invokeClient(async c => {
        let device = await c.getDevice(this.id);

        // Fetch and set the last hour's power consumption
        await this.fetchLastHourWattsConsumption(c, device);

        return device;
      });
      //TODO: the mock device throws 403 above
      if (!device)
        throw new Error("Device "+this.id+" not found.");
    }
    catch (e) {
      this.error("getDevice failed:", e);
      if (e instanceof Error)
        await this.setWarning(e.message);
      throw e;
    }
    await this.unsetWarning();

    let airSwingLR;
    if ((device.airSwingLR as any) == 5)
      airSwingLR = AirSwingLR.RightMid; // https://github.com/ugumba/homey-panasonic-comfort-cloud-alt/issues/34
    else if ((device.airSwingLR as any) == 6)
      airSwingLR = AirSwingLR.Mid; // https://github.com/ugumba/homey-panasonic-comfort-cloud-alt/issues/40
    else 
      airSwingLR = AirSwingLR[device.airSwingLR];

    await this.setCap('onoff', device.operate == Power.On);
    if (device.insideTemperature != 126)
      await this.setCap('measure_temperature', device.insideTemperature);
    await this.setCap('measure_temperature_outside', device.outTemperature);
    await this.setCap('target_temperature', device.temperatureSet);
    await this.setCap('operation_mode', OperationMode[device.operationMode]);
    await this.setCap('eco_mode', EcoMode[device.ecoMode]);
    if (airSwingLR === undefined)
      this.log("failed to parse airSwingLR value '"+device.airSwingLR+"'");
    else
      await this.setCap('air_swing_lr', airSwingLR); 
    await this.setCap('air_swing_ud', AirSwingUD[device.airSwingUD]);
    await this.setCap('fan_auto_mode', FanAutoMode[device.fanAutoMode]);
    await this.setCap('fan_speed', FanSpeed[device.fanSpeed]);
    await this.setCap('nanoe_mode', NanoeMode[device.nanoe]);
  }

  async fetchAndRestartTimer() {
    await this.fetchMutex.runExclusive(async () => {
      if (this.timer)
        this.homey.clearInterval(this.timer);
      await this.fetchFromService(true);
      this.timer = this.homey.setInterval(async () => {
        try {
          await this.fetchFromService(false);
        } catch (e) {
          this.error("Timer-based fetchFromService failed:", e);
          // Don't set warning here as it would spam the user
        }
      }, 60000);
    });
  }

  async postToService(values: {[x:string]:any}) {
    this.log('postToService:', values);
    if (this.alwaysOn && values['onoff'] == Power.Off) {
      // alwaysOn=true, so block transmitting Power.Off to device
      this.log("  always on set -> block power off");
      return;
    }
    
    let params : Parameters = { 
      operate: getParam(values['onoff'], v => v ? Power.On : Power.Off), 
      temperatureSet: values['target_temperature'],
      operationMode: getParam(values['operation_mode'], v => OperationMode[v]),
      ecoMode: getParam(values['eco_mode'], v => EcoMode[v]),
      airSwingLR: getParam(values['air_swing_lr'], v => (AirSwingLR[v] as any) == 3 ? 5 : AirSwingLR[v]), // See comment in fetchFromService on AirSwingLR
      airSwingUD: getParam(values['air_swing_ud'], v => AirSwingUD[v]),
      fanAutoMode: getParam(values['fan_auto_mode'], v => FanAutoMode[v]),
      fanSpeed: getParam(values['fan_speed'], v => FanSpeed[v]),
      actualNanoe: getParam(values['nanoe_mode'], v => NanoeMode[v])
    };
    try {
      await this.driver.invokeClient(c => c.setParameters(this.id, params));
    }
    catch (e) {
      this.error("setParameters failed:", e);
      if (e instanceof Error)
        await this.setWarning(e.message);
      throw e;
    }
    await this.fetchAndRestartTimer();
  }

  /**
   * Method to collect all our action flow cards
   */
  async initActionCards() {
    const changeAirSwingUD = this.homey.flow.getActionCard('change-air-swing-updown');
    changeAirSwingUD.registerRunListener(async (args) => {
      await this.postToService({ air_swing_ud: args.direction });
    });

    const changeAirSwingLR = this.homey.flow.getActionCard('change-air-swing-leftright');
    changeAirSwingLR.registerRunListener(async (args) => {
      await this.postToService({ air_swing_lr: args.direction });
    });

    const changeOperationMode = this.homey.flow.getActionCard('change-operation-mode');
    changeOperationMode.registerRunListener(async (args) => {
      await this.postToService({ operation_mode: args.mode });
    });

    const changeFanSpeed = this.homey.flow.getActionCard('change-fan-speed');
    changeFanSpeed.registerRunListener(async (args) => {
      await this.postToService({ fan_speed: args.speed });
    });

    const changeEcoMode = this.homey.flow.getActionCard('change-eco-mode');
    changeEcoMode.registerRunListener(async (args) => {
      await this.postToService({ eco_mode: args.mode });
    });

  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    this.registerMultipleCapabilityListener(
      [
        'onoff',
        'target_temperature',
        'operation_mode',
        'eco_mode',
        'air_swing_lr',
        'air_swing_ud',
        'fan_auto_mode',
        'fan_speed',
        'nanoe_mode'
      ],
      values => this.postToService(values),
      3000
    );

    try {
      await this.fetchAndRestartTimer();
    }
    catch (e) {
      if (e instanceof Error)
        await this.setWarning(e.message);
      else 
        throw e;
    }

    // TO BE DEPRECATED: Do not initialize action cards from the device (since devices::onInit is called for every device) but from drivers::onInit
    await this.initActionCards();

    const settings = this.getSettings();
    this.alwaysOn = settings.alwayson;

    this.log("Device '"+this.id+"' has been initialized");
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Device has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({oldSettings,newSettings,changedKeys,}: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log("Device settings changed: " + changedKeys.toString());
    if (changedKeys.toString().includes('alwayson')) {
      this.alwaysOn = Boolean(newSettings.alwayson);
      this.log("    alwayson changed to: ", this.alwaysOn);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log("Device '"+this.id+"' was renamed to '"+name+"'");
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    if (this.timer)
      this.homey.clearInterval(this.timer);
    this.log("Device '"+this.id+"' has been deleted");
  }

}

module.exports = MyDevice;
