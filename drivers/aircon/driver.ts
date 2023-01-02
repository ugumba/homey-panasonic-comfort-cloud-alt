import Homey from 'homey';
import { ComfortCloudClient, TokenExpiredError } from 'panasonic-comfort-cloud-client';

export class MyDriver extends Homey.Driver {

  client: ComfortCloudClient | null = null;

  async getClient() : Promise<ComfortCloudClient> {
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
          throw 'missing credentials';
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

  async invokeClient<T>(request: (client: ComfortCloudClient) => Promise<T>) : Promise<T> {
    while (true)
    {
      let client = await this.getClient();
      try {
        return await request(client);
      }
      catch (e) {
        if (e instanceof TokenExpiredError)
        {
          this.log('invokeClient TokenExpiredError');
          this.resetClient();
        }
        else
        {
          this.log('invokeClient exception:', e);
          throw e;
        }
      }
    }
  }

  resetClient() {
    this.log('resetClient');
    this.client = null;
    this.homey.settings.set("token", null);
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {

    this.homey.on('settings.set', () => {
      this.log('settings.set');
      this.resetClient();
    });
    this.homey.on('settings.unset', () => {
      this.log('settings.unset');
      this.resetClient();
    });

    this.log('MyDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    this.log('onPairListDevices');
    return (await this.invokeClient(c => c.getGroups()))
      .flatMap(group => group.devices.map(device => ({
        name: group.name + ": " + device.name,
        data: {
          id: device.guid
        }
      })));
  }

}

module.exports = MyDriver;
