# Panasonic Comfort Cloud Alternative

This is an alternative unofficial [Homey](https://homey.app) app for controlling air conditioning and heat pump devices via the [Panasonic Comfort Cloud](https://www.panasonic.com/global/hvac/air-conditioning/connectivity/comfort-cloud.html) service.

# Why?

There's already an unofficial [Homey app for PCC](https://homey.app/en-us/app/com.panasonic.PCC/Panasonic-Comfort-Cloud/) (referred to as "the original app" below), but it's closed source, with no official forum, and is maintained by a single, hard-to-reach developer.  An ad-hoc community thread has gathered [here](https://community.homey.app/t/error-panasonic-comfort-cloud-app/65935).

Panasonic recently imposed rate-limiting on their authentication service.  The original app stopped working - showing "internal server error" or "ServerError" in Homey.  (It probably authenticates on every service request, ignoring the auth token.)

The alternative app presented here is virtually identical in behaviour, except that authentication occurs only once, and the auth token is reused until it expires.

# Installation

This repo is in early development, so not published to Homey store yet.  Athom will probably not approve it easily, because of the existence of the original app.

Adventurous souls can install from [Homey Community Store](https://store.homey.community/app/net.schmidt-cisternas.pcc-alt), or manually by cloning/downloading this repo, setting up the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli), and running e.g. ```homey app install```.

*All usage is at your own risk!*  The app has not been through any kind of QA beyond my personal usage.  Having said that, it's been running stable for me for several weeks.

# Configuration

The credentials must be provided in the app settings.  It is recommended that you create distinct credentials for Homey.  Credentials are created with the official PCC app (Android/iPhone), and must be granted permission to control your device(s).  

You should disable the original app, otherwise it's likely to keep causing your credentials to be blocked.  If your credentials are currently blocked, they won't work any better in my app.  You might have to wait up to 24 hours before the block lifts, or you can create new credentials.

If/when the original app is fixed, you should make sure only one of the apps is enabled at any one time.  Otherwise they will compete to apply settings to your devices, resulting in much more traffic to the servers.

Note that any flows using the original app must be updated - and there may be missing functionality in my app (I've not added any custom flow cards at all).  You may want to duplicate your existing flows and keep the originals disabled (as a backup), in case you want to switch back.

(Specifically, I've not yet been able to use [Device Capabilities](https://homey.app/en-us/app/nl.qluster-it.DeviceCapabilities/Device-Capabilities/) to control e.g. "operation mode" or "eco mode", which [I could](https://community.homey.app/t/error-panasonic-comfort-cloud-app/65935/31?u=robert_schmidt) with the original app.)

# Credits

  * Vegard Svendsen for [the original Homey app](https://homey.app/en-us/app/com.panasonic.PCC/Panasonic-Comfort-Cloud/).
  * The app relies heavily on [panasonic-comfort-cloud-client](https://github.com/marc2016/panasonic-comfort-cloud-client).  The main reason I got the app working within a couple of hours!
  * Athom provides an easy to use [CLI, SDK and app template](https://apps.developer.homey.app/the-basics/getting-started/homey-cli).  The combined quality ensured I hit the ground running.
  * Icon downloaded from [SVG Repo](https://www.svgrepo.com/svg/288102/air-conditioning-air-conditioner).