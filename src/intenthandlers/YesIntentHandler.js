const utilities = require("../utilities");
const hasIn = require("immutable").hasIn;

const states = require("constants/Constants").states;
const applinks = require("constants/Constants").applinks;
const ios = require("constants/Constants").ios;
const android = require("constants/Constants").android;

/**
 * Handles YesIntent.
 * YesIntent is only expected in response to Maps directions being offered to the user. This
 * might change in the future though.
 */
module.exports = YesIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'AMAZON.YesIntent');
  },
  handle(handlerInput) {
    validate(handlerInput);
    const { attributesManager, responseBuilder } = handlerInput;

    const sessionAttributes = attributesManager.getSessionAttributes();
    const latitude = sessionAttributes.latitude;
    const longitude = sessionAttributes.longitude;

    const isAndroid = isAndroidBased(handlerInput);
    const appLink = buildAppLink(isAndroid, latitude, longitude);
    return responseBuilder
      .withShouldEndSession(undefined)
      .addDirective(createAppLinkSkillConnection(
        isAndroid, appLink, "Okay.", "Please unlock your device to see the directions."
      ))
      .getResponse();
  }
};

/**
 * Assumes AppLinks is supported and supported catalog types are already validated. Returns
 * true is the request is coming from an Android based device.
 */
function isAndroidBased(handlerInput) {
  const appLinksInterface = handlerInput.requestEnvelope.context[applinks.APP_LINK_INTERFACE];
  return appLinksInterface.supportedCatalogTypes.includes(android.STORE_TYPE);
}

function buildAppLink(isAndroid, latitude, longitude) {
  if (isAndroid) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  return `https://maps.apple.com/?daddr=${latitude},${longitude}`;
}

function createAppLinkSkillConnection(isAndroid, universalLink, unlockedSpeech, lockedScreenSpeech) {
  let identifier = ios.APPLE_MAPS_IDENTIFIER, storeType = ios.STORE_TYPE;
  if (isAndroid) {
    identifier = android.GOOGLE_MAPS_IDENTIFIER;
    storeType = android.STORE_TYPE;
  }

  return {
    type: "Connections.StartConnection",
    uri: "connection://AMAZON.LinkApp/1",
    input: {
      catalogInfo: {
        identifier: identifier,
        type: storeType,
      },
      actions: {
        primary: {
          type: applinks.UNIVERSAL_APP_LINK_TYPE,
          link: universalLink
        }
      },
      prompts: {
        onAppLinked: {
          prompt: {
            ssml: `<speak>${unlockedSpeech}</speak>`,
            type: "SSML"
          },
          defaultPromptBehavior: applinks.SPEAK_PROMPT_BEHAVIOR
        },
        onScreenLocked: {
          prompt: {
            ssml: `<speak>${lockedScreenSpeech}</speak>`,
            type: "SSML"
          }
        }
      }
    }
  }
}

function validate(handlerInput) {
  const { attributesManager, requestEnvelope } = handlerInput;

  // Verify that AppLinks interface is supported.
  if (!hasIn(requestEnvelope, ["context", "System", "device", "supportedInterfaces", applinks.APP_LINK_INTERFACE]))
    throw Error(`AppLinks interface is not supported on this device. We should not have offered Maps directions.`);

  // Verify that catalog type (basically mobile app store) is provided.
  if (!hasIn(requestEnvelope, ["context", applinks.APP_LINK_INTERFACE, "supportedCatalogTypes"]))
    throw Error(`Unexpected error. Supported catalog types are not provided`);

  // Verify that the given store type is either iOS or Android.
  const supportedCatalogTypes = handlerInput.requestEnvelope.context[applinks.APP_LINK_INTERFACE].supportedCatalogTypes;
  if (!supportedCatalogTypes.includes(ios.STORE_TYPE) && !supportedCatalogTypes.includes(android.STORE_TYPE)) {
    throw Error(`None of the catalog types: ${supportedCatalogTypes} is supported by the skill. It has to be either iOS or Android.`);
  }

  // Verify state is available and valid.
  const sessionAttributes = attributesManager.getSessionAttributes();
  const state = sessionAttributes.state;
  const latitude = sessionAttributes.latitude;
  const longitude = sessionAttributes.longitude;

  if (!state || states.OFFER_DIRECTIONS !== state || !isLatitude(latitude) || !isLongitude(longitude))
    throw Error(`Session attributes is either missing some information or has invalid information. State: ${state}, Latitude: ${latitude}, Longitude: ${longitude}.`);
}

function isLatitude(latitude) {
  return latitude && isFinite(latitude) && Math.abs(latitude) <= 90;
}

function isLongitude(longitude) {
  return longitude && isFinite(longitude) && Math.abs(longitude) <= 180;
}