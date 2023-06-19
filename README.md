# Panasonic Comfort Cloud Alternative

This is an alternative unofficial [Homey](https://homey.app) app for controlling air conditioning and air-to-air heat pump devices via the [Panasonic Comfort Cloud](https://www.panasonic.com/global/hvac/air-conditioning/connectivity/comfort-cloud.html) service.
Air-to-water (Aquarea) devices are *not* supported.

A discussion topic can be found [here](https://community.homey.app/t/app-pro-panasonic-comfort-cloud-alternative/75906).

# Why?

There's already an unofficial [Homey app for PCC](https://homey.app/en-us/app/com.panasonic.PCC/Panasonic-Comfort-Cloud/) (referred to as "the original app" below), but it's closed source, with no official forum, and is maintained by a single, hard-to-reach developer.  An ad-hoc community thread for the original app has gathered [here](https://community.homey.app/t/error-panasonic-comfort-cloud-app/65935).

Late 2022, Panasonic imposed rate-limiting on their authentication service.  The original app stopped working - showing "internal server error" or "ServerError" in Homey.  (It probably authenticates on every service request, ignoring the auth token.)

The alternative app presented here is virtually identical in behaviour, except that authentication occurs only once, and the auth token is reused until it expires.

# Installation

This app is not published to Homey store - for me, the effort I'd have to spend on polishing is not worth it.  Athom is also likely to drag their feet approving it, because of the existence of the original app.

However, you may install from [Homey Community Store](https://store.homey.community/app/net.schmidt-cisternas.pcc-alt) - make sure you follow the instructions for [HCS](https://store.homey.community/hcs).

Or, you can install manually by cloning/downloading this repo, setting up the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli), and running e.g. ```homey app install```.

The app has not been through any kind of QA beyond myself and a few users testing it.  Having said that, it's been running stable for me for a long time.

# Configuration

The credentials must be provided in the app settings.  It is recommended that you create distinct credentials for Homey.  Credentials must be created using the official PCC app (Android/iPhone), and must be granted permission to control your device(s).  

You should disable the original app, otherwise it's likely to keep causing your credentials to be blocked.  If your credentials are currently blocked, they won't work any better in my app.  You might have to wait up to 24 hours before the block lifts, or you can create new credentials.

If/when the original app is fixed, you should make sure only one of the apps is enabled at any one time.  Otherwise they will compete to apply settings to your devices, resulting in much more traffic to the servers.

Note that any flows using the original app must be updated - and there may be missing functionality in my app.  You may want to duplicate your existing flows and keep the originals disabled (as a backup), in case you want to switch back.

There are flow cards for setting capabilities other than target temperature (thanks, [nickmurison](https://github.com/nickmurison)!).

# Troubleshooting

The settings page shows the most recent log contents.  If you have a problem, please copy and paste the entire log into a Github issue, or send me a direct message if you're concerned about privacy.

The log contains the user name (somewhat obfuscated) and PCC device names and IDs (but never the password, obviously).

# Credits

  * [Nick Murison](https://github.com/nickmurison) for [adding more flow cards](https://github.com/ugumba/homey-panasonic-comfort-cloud-alt/pull/7).
  * Vegard Svendsen for [the original Homey app](https://homey.app/en-us/app/com.panasonic.PCC/Panasonic-Comfort-Cloud/).
  * The app relies heavily on [panasonic-comfort-cloud-client](https://github.com/marc2016/panasonic-comfort-cloud-client).  The main reason I got the app working within a couple of hours!
  * Athom provides an easy to use [CLI, SDK and app template](https://apps.developer.homey.app/the-basics/getting-started/homey-cli).  The combined quality ensured I hit the ground running.
  * Thanks to the maintainers of [Homey Community Store](https://store.homey.community) for providing a home!
  * Icon downloaded from [SVG Repo](https://www.svgrepo.com/svg/288102/air-conditioning-air-conditioner).
