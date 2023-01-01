import Homey from 'homey';
import { ComfortCloudClient } from 'panasonic-comfort-cloud-client';

export class MyDriver extends Homey.Driver {

  client: ComfortCloudClient | null = null;

  async getClient() : Promise<ComfortCloudClient | null>
  {
    if (!this.client)
    {
      this.log('initializing client');
      this.client = new ComfortCloudClient();
      let token:string = this.homey.settings.get("token");
      if (!token || token.length == 0)
      {
        this.log('missing token');
        const username = this.homey.settings.get("username");
        const password = this.homey.settings.get("password");
        if (!username || !password)
        {
          this.log('missing credentials');
          return null;
        }
        this.log('authenticating as '+username);
        token = await this.client.login(username, password);
        this.homey.settings.set("token", token);
        this.log('saved token');
      }
      else {
        this.client.token = token;
      }
    }

    return this.client;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {

    this.log('onPairListDevices');

    let client = await this.getClient();
    if (!client)
      return [];

    return (await client.getGroups())
      .flatMap(group => group.devices.map(device => ({
        name: group.name + ": " + device.name,
        data: {
          id: device.guid
        }
      })));


    return [
      // Example device data, note that `store` is optional
      // {
      //   name: 'My Device',
      //   data: {
      //     id: 'my-device',
      //   },
      //   store: {
      //     address: '127.0.0.1',
      //   },
      // },
    ];
  }

}

module.exports = MyDriver;
