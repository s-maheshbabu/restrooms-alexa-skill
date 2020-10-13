const utilities = require("../utilities");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const GoogleMaps = require("gateway/GoogleMaps");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

const IntentHelper = require("./FindRestroomIntentHelper");
const InvalidAddressError = require("../errors/InvalidAddressError");
const isPositivelyRated = require("./FindRestroomIntentHelper").isPositivelyRated;

module.exports = FindRestroomAtAddressIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'FindRestroomAtAddressIntent');
  },
  async handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    const address = getAddress(handlerInput);
    let coordinates;
    try {
      coordinates = await GoogleMaps.getCoordinates(address);
    } catch (error) {
      if (error instanceof InvalidAddressError) {
        console.log(error);
      }
      // Bubble up any other error to render a generic error message.
      else throw error;
    }
    if (!coordinates) {
      return responseBuilder
        .speak(`Sorry. Given address is not a valid address in the US. Please try again with a valid US based address.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    const filters = IntentHelper.getSearchFilters(handlerInput);
    const restrooms = await RR.searchRestroomsByLatLon(coordinates.latitude, coordinates.longitude, filters.isFilterByADA, filters.isFilterByUnisex, filters.isFilterByChangingTable);

    if (!Array.isArray(restrooms) || !restrooms.length) {
      return responseBuilder
        .speak(`I'm sorry. I couldn't find any restrooms at given address matching your criteria.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    const emailAddress = await IntentHelper.getEmailAddress(handlerInput);
    if (emailAddress) {
      // Is it possible to not wait on sending the email?
      await Mailer.sendEmail(emailAddress, 'given address', restrooms);
      console.log("We have the user's email address. An email was sent with the search results.");
    }

    // TODO: We can't always say 'this and more results'. What if there was only one result?
    const builder = responseBuilder
      .speak(`I found this ${isPositivelyRated(restrooms[0]) ? `positively rated ` : ``}restroom at given address. ${IntentHelper.describeRestroom(restrooms[0])}.${emailAddress ? ` I also sent this and more restrooms to your email.` : ` ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}`}`)
      .addDirective(IntentHelper.buildAPLDirective('given address', restrooms[0], !emailAddress))
      .withShouldEndSession(true);

    if (!emailAddress) builder.withAskForPermissionsConsentCard([scopes.EMAIL_SCOPE]);
    else builder.withSimpleCard(...IntentHelper.buildSimpleCard('given address', restrooms));

    return builder.getResponse();
  }
}

/**
 * Construct address from the street, city and state fields
 * in the session attributes.
 * TODO: Add spaces and commas to make it easier for Google
 * TODO: Convert input like 'six zero one', 'six oh one' etc to 601.
 */
function getAddress(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const street = sessionAttributes.street;
  const city = sessionAttributes.city || '';
  const state = sessionAttributes.state || '';

  const address = street + city + state;
  // TODO: Test this.
  if (!address) throw new Error("Address was empty. Address should include at least the street name.");
  return address;
}
