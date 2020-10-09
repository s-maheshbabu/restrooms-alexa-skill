require("app-module-path").addPath(__dirname);

const Alexa = require("ask-sdk-core");

const FindRestroomNearMeAPI = require("api/FindRestroomNearMeAPI");
const FindRestroomAtLocationAPI = require("api/FindRestroomAtLocationAPI");
const FindRestroomAtAddressAPI = require("api/FindRestroomAtAddressAPI");

const CancelAndStopIntentHandler = require("intenthandlers/CancelAndStopIntentHandler");
const FindRestroomAtLocationIntentHandler = require("intenthandlers/FindRestroomAtLocationIntentHandler");
const FindRestroomAtAddressIntentHandler = require("intenthandlers/FindRestroomAtAddressIntentHandler");
const FindRestroomNearMeIntentHandler = require("intenthandlers/FindRestroomNearMeIntentHandler");

const SessionEndedRequestHandler = require("requesthandlers/SessionEndedRequestHandler");

const SESTransporterInterceptor = require("interceptors/SESTransporterInterceptor");
const ZipcodesDataLoadInterceptor = require("interceptors/ZipcodesDataLoadInterceptor");
const ResponseSanitizationInterceptor = require("interceptors/ResponseSanitizationInterceptor");

const ErrorHandler = require("errors/ErrorHandler");

// ***************************************************************************************************
// These simple interceptors just log the incoming and outgoing request bodies to assist in debugging.

const LogRequestInterceptor = {
  process(handlerInput) {
    console.log(`REQUEST ENVELOPE = ${JSON.stringify(handlerInput.requestEnvelope)}`);
  },
};

const LogResponseInterceptor = {
  process(handlerInput, response) {
    console.log(`RESPONSE = ${JSON.stringify(response)}`);
  },
};

// --------------- Skill Initialization -----------------------
let skill;

exports.handler = async function (event, context) {
  if (!skill) {
    skill = Alexa.SkillBuilders.custom()
      .addRequestHandlers(
        CancelAndStopIntentHandler,
        FindRestroomAtLocationIntentHandler,
        FindRestroomAtAddressIntentHandler,
        FindRestroomNearMeIntentHandler,
        SessionEndedRequestHandler,
        FindRestroomNearMeAPI,
        FindRestroomAtAddressAPI,
        FindRestroomAtLocationAPI,
      )
      .addRequestInterceptors(
        SESTransporterInterceptor,
        ZipcodesDataLoadInterceptor,
        LogRequestInterceptor,
      )
      .addResponseInterceptors(
        LogResponseInterceptor,
        ResponseSanitizationInterceptor,
      )
      .addErrorHandlers(ErrorHandler)
      .withApiClient(new Alexa.DefaultApiClient())
      .create();
  }

  return skill.invoke(event, context);
};
