import Homey from 'homey';
import { MyDriver } from './driver';
import { Power, Parameters, OperationMode, EcoMode, AirSwingLR, AirSwingUD, FanAutoMode, FanSpeed, NanoeMode, Device } from 'panasonic-comfort-cloud-client';

function getParam(value:any, transform: (v:any) => any) : any {
  if (value === undefined)
    return undefined;
  return transform(value);
}

export class MyDevice extends Homey.Device {

  id: string = this.getData().id;
  driver: MyDriver = this.driver as MyDriver;
  timer: NodeJS.Timer|null = null; 

  async setCap<T>(name:string, value:T) {
    let current = this.getCapabilityValue(name);
    if (value == current)
      return;
    this.log("setCapabilityValue("+name+", "+value+")");
    await this.setCapabilityValue(name, value);
  }
  
  async fetchFromService(forced:boolean) {
    // this.log("fetchFromService("+forced+")");
    let device:Device|null;
    try {
      device = await this.driver.invokeClient(c => c.getDevice(this.id));
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

    await this.setCap('onoff', device.operate == Power.On);
    await this.setCap('measure_temperature', device.insideTemperature);
    await this.setCap('target_temperature', device.temperatureSet);
    await this.setCap('operation_mode', OperationMode[device.operationMode]);
    await this.setCap('eco_mode', EcoMode[device.ecoMode]);
    await this.setCap('air_swing_lr', AirSwingLR[device.airSwingLR]);
    await this.setCap('air_swing_ud', AirSwingUD[device.airSwingUD]);
    await this.setCap('fan_auto_mode', FanAutoMode[device.fanAutoMode]);
    await this.setCap('fan_speed', FanSpeed[device.fanSpeed]);
    await this.setCap('nanoe_mode', NanoeMode[device.nanoe]);
  }

  async fetchAndRestartTimer() {
    if (this.timer)
      this.homey.clearInterval(this.timer);
    await this.fetchFromService(true);
    this.timer = this.homey.setInterval(() => this.fetchFromService(false), 60000);
  }

  async postToService(values: {[x:string]:any}) {
    this.log('postToService:', values);
    let params : Parameters = { 
      operate: getParam(values['onoff'], v => v ? Power.On : Power.Off), 
      temperatureSet: values['target_temperature'],
      operationMode: getParam(values['operation_mode'], v => OperationMode[v]),
      ecoMode: getParam(values['eco_mode'], v => EcoMode[v]),
      airSwingLR: getParam(values['air_swing_lr'], v => AirSwingLR[v]),
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

    await this.initActionCards();

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
  async onSettings({ oldSettings: {}, newSettings: {}, changedKeys: [] }): Promise<string|void> {
    this.log('Device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('Device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    if (this.timer)
      clearInterval(this.timer);
    this.log('Device has been deleted');
  }

}

module.exports = MyDevice;
