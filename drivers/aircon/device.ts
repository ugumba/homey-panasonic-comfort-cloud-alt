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
  fetchinterval: number = 60;

  async setCap<T>(name:string, value:T) {
    // Try adding the capability if it does not exist
    if (!this.hasCapability(name)) {
      await this.addCapability(name);
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

  // Fetch current power consumption and update energy tracking
  async fetchPowerConsumption(client: ComfortCloudClient, device: Device | null) {
    if (!device)
      return;

    // Get the timezone offset in the format "+01:00" with Europe/Oslo as default (Change this to some other default?)
    let timeZone = this.minutesToHours(this.getOffset(this.homey.clock.getTimezone() || 'Europe/Oslo')) || '+01:00';

    // Get today's history data for the device
    let historyData = await client.getDeviceHistoryData(device.guid, new Date(), 0, timeZone);
    
    // Filter out the -255 values, which are used to indicate hours that has not passed yet in the current day
    let historyWithData = historyData.historyDataList.filter((i: any) => i.consumption != -255);

    // Always process energy consumption first (even if device is OFF to capture residual consumption)
    await this.updateEnergyConsumption(historyWithData);

    // Get the consumption from the current hour (last available data)
    let consumption = historyWithData?.[historyWithData?.length - 1]?.consumption || 0;

    // If the device is OFF, set current power to 0 but keep the energy tracking from above
    if (device.operate !== Power.On) {
      this.setCap('measure_power', 0);
      return;
    }

    // Set the measure_power capability to the consumption in watts instead of kilowatts
    this.setCap('measure_power', consumption * 1000);
  }

  // Update cumulative energy consumption for meter_power (kWh)
  async updateEnergyConsumption(historyWithData: any[]) {
    const processedHours = this.getStoreValue('processedHours') || [];
    const lastMeterValue = this.getStoreValue('lastMeterValue') || 0;
    
    let newConsumption = 0;
    let newProcessedHours = [...processedHours];
    const today = new Date().toDateString();
    
    // Process each hour's data and only add consumption for hours we haven't processed yet
    for (let i = 0; i < historyWithData.length; i++) {
      const hourData = historyWithData[i];
      const hourKey = `${today}-${i}`;
      
      // Changed: removed the > 0 check to capture all consumption including small amounts
      if (!processedHours.includes(hourKey) && hourData.consumption >= 0) {
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

        // Fetch and set current power consumption and update energy tracking
        await this.fetchPowerConsumption(c, device);

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

    let airSwingLRcode = device.airSwingLR as any;
    if (airSwingLRcode == 5)
      airSwingLRcode = 3; // map to RightMid (https://github.com/ugumba/homey-panasonic-comfort-cloud-alt/issues/34)
    else if (airSwingLRcode == 6)
      airSwingLRcode = 2; // map to Mid (https://github.com/ugumba/homey-panasonic-comfort-cloud-alt/issues/40)
    let airSwingLR = AirSwingLR[airSwingLRcode];

    await this.setCap('onoff', device.operate == Power.On);
    if (device.insideTemperature != 126) {
      await this.setCap('measure_temperature', device.insideTemperature);
      await this.setCap('measure_temperature_inside', device.insideTemperature);
    }
    await this.setCap('measure_temperature_outside', device.outTemperature);
    await this.setCap('target_temperature', device.temperatureSet);
    await this.setCap('thermostat_mode', OperationMode[device.operationMode].toLowerCase());
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
      }, this.fetchinterval * 1000);
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
      // Uppercase first letter to match the enum values in ComfortCloudClient
      operationMode: getParam(values['thermostat_mode'], v => OperationMode[v.charAt(0).toUpperCase() + v.slice(1)]),
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
      await this.postToService({ thermostat_mode: args.mode });
    });

    const changeFanSpeed = this.homey.flow.getActionCard('change-fan-speed');
    changeFanSpeed.registerRunListener(async (args) => {
      await this.postToService({ fan_speed: args.speed });
    });

    const changeEcoMode = this.homey.flow.getActionCard('change-eco-mode');
    changeEcoMode.registerRunListener(async (args) => {
      await this.postToService({ eco_mode: args.mode });
    });
    this.log("device action cards have been initialized");
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    this.registerMultipleCapabilityListener(
      [
        'onoff',
        'target_temperature',
        'thermostat_mode',
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

    const settings = this.getSettings();
    this.alwaysOn = settings.alwayson;
    this.fetchinterval = settings.fetchinterval;

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
    // Make sure action cards are initialized only once in case of multiple devices
    await this.driver.actionCardsMutex.runExclusive(async () => {
      if (this.driver.actionCardsInitiated === false) {
        await this.initActionCards();
        this.driver.actionCardsInitiated = true;
      }
    });

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
    if (changedKeys.toString().includes('fetchinterval')) {
      this.fetchinterval = Number(newSettings.fetchinterval);
      this.log("    fetchinterval changed to: ", this.fetchinterval);
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
