require("app-module-path").addPath(__dirname);

const Alexa = require("ask-sdk-core");

const FindRestroomNearMeAPI = require("api/FindRestroomNearMeAPI");
const FindRestroomAtLocationAPI = require("api/FindRestroomAtLocationAPI");
const FindRestroomAtAddressAPI = require("api/FindRestroomAtAddressAPI");

const CancelAndStopIntentHandler = require("intenthandlers/CancelAndStopIntentHandler");
const NoIntentHandler = require("intenthandlers/NoIntentHandler");
const YesIntentHandler = require("intenthandlers/YesIntentHandler");
const FindRestroomAtLocationIntentHandler = require("intenthandlers/FindRestroomAtLocationIntentHandler");
const FindRestroomAtAddressIntentHandler = require("intenthandlers/FindRestroomAtAddressIntentHandler");
const FindRestroomNearMeIntentHandler = require("intenthandlers/FindRestroomNearMeIntentHandler");

const SessionEndedRequestHandler = require("requesthandlers/SessionEndedRequestHandler");
const SessionResumedRequestHandler = require("requesthandlers/SessionResumedRequestHandler");

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
        FindRestroomAtAddressAPI,
        FindRestroomAtAddressIntentHandler,
        FindRestroomAtLocationAPI,
        FindRestroomAtLocationAPI,
        FindRestroomAtLocationIntentHandler,
        FindRestroomNearMeAPI,
        FindRestroomNearMeIntentHandler,
        NoIntentHandler,
        SessionEndedRequestHandler,
        SessionResumedRequestHandler,
        YesIntentHandler,
      )
      .addRequestInterceptors(
        SESTransporterInterceptor,
        ZipcodesDataLoadInterceptor,
        LogRequestInterceptor,
      )
      .addResponseInterceptors(
        ResponseSanitizationInterceptor,
        LogResponseInterceptor,
      )
      .addErrorHandlers(ErrorHandler)
      .withApiClient(new Alexa.DefaultApiClient())
      .create();
  }

  return skill.invoke(event, context);
};
