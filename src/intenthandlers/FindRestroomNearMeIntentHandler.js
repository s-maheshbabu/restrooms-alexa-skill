const RR = require("gateway/refugeeRestrooms");
const messages = require("constants/Messages");

const ADDRESS_SCOPE = ['read::alexa:device:all:address:country_and_postal_code'];

module.exports = FindRestroomNearMeIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name === "FindRestroomNearMeIntent")
    );
  },
  async handle(handlerInput) {
    const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;
    const restrooms = await RR.searchRestroomsByLatLon();

    const consentToken = requestEnvelope.context.System.apiAccessToken;
    if (!consentToken) {
      return responseBuilder
        .speak(messages.NOTIFY_MISSING_PERMISSIONS)
        .withAskForPermissionsConsentCard(ADDRESS_SCOPE)
        .getResponse();
    }

    const { deviceId } = requestEnvelope.context.System.device;
    const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();

    let address;
    //address = {}; address.postalCode = "dummy postal code";
    try {
      address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
    } catch (error) {
      if (error.name !== 'ServiceError') {
        const response = responseBuilder.speak(messages.ERROR).getResponse();
        return response;
      }
      throw error;
    }

    console.log('Address successfully retrieved, now responding to user.');
    // If address.countryCode !== US, say only supported in the US.
    // If address.postalCode === null, say address is not configured.

    return responseBuilder
      .speak(`Placeholder response ${JSON.stringify(restrooms[0].name)} ${address.postalCode}`)
      .withShouldEndSession(true)
      .getResponse();
  }
}