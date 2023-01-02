import Homey from 'homey';
import { MyDriver } from './driver';
import { Power, Parameters, OperationMode, EcoMode, AirSwingLR, AirSwingUD, FanAutoMode, FanSpeed, NanoeMode } from 'panasonic-comfort-cloud-client';

function getParam(value:any, transform: (v:any) => any) : any {
  if (value === undefined)
    return undefined;
  return transform(value);
}

class MyDevice extends Homey.Device {

  id: string = this.getData().id;
  driver: MyDriver = this.driver as MyDriver;
  timer: NodeJS.Timer|null = null; 

  async setCap<T>(name:string, value:T) {
    let current = this.getCapabilityValue(name);
    if (value == current)
      return;
    this.log("setCap("+name+"):", value, "(was", current,")");
    await this.setCapabilityValue(name, value);
  }
  
  async updateCapabilitiesFromClient(forced:boolean) {
    this.log("updateFromClient("+forced+")");
    let device = await this.driver.invokeClient(c => c.getDevice(this.id));
    if (!device)
    {
      this.log("getDevice() == null");
      return;
    }
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

  async updateAndRestartTimer() {
    if (this.timer)
      clearInterval(this.timer);
    await this.updateCapabilitiesFromClient(true);
    this.timer = setInterval(() => this.updateCapabilitiesFromClient(false), 60000);
  }

  async setParametersFromCapabilityValues(values: {[x:string]:any}) {
    this.log('changing:', values);
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
    this.log('setParameters:', params);
    await this.driver.invokeClient(c => c.setParameters(this.id, params));
    await this.updateAndRestartTimer();
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    await this.updateAndRestartTimer();

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
      values => this.setParametersFromCapabilityValues(values),
      3000
    );

    this.log('MyDevice has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('MyDevice has been added');
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
    this.log('MyDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('MyDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('MyDevice has been deleted');
  }

}

module.exports = MyDevice;
