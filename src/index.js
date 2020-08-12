require("app-module-path").addPath(__dirname);

const Alexa = require("ask-sdk");

const CancelAndStopIntentHandler = require("intenthandlers/CancelAndStopIntentHandler");
const FindRestroomIntentHandler = require("intenthandlers/FindRestroomIntentHandler");
const FindRestroomNearMeIntentHandler = require("intenthandlers/FindRestroomNearMeIntentHandler");
const HelpIntentHandler = require("intenthandlers/HelpIntentHandler");

const LaunchRequestHandler = require("requesthandlers/LaunchRequestHandler");
const SessionEndedRequestHandler = require("requesthandlers/SessionEndedRequestHandler");

const PostalCodeToLatLonDataLoadInterceptor = require("interceptors/PostalCodeToLatLonDataLoadInterceptor");

const ErrorHandler = require("errors/ErrorHandler");

// ***************************************************************************************************
// These simple interceptors just log the incoming and outgoing request bodies to assist in debugging.

const LogRequestInterceptor = {
  process(handlerInput) {
    //console.log(`REQUEST ENVELOPE = ${JSON.stringify(handlerInput.requestEnvelope)}`);
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
        FindRestroomIntentHandler,
        FindRestroomNearMeIntentHandler,
        HelpIntentHandler,
        LaunchRequestHandler,
        SessionEndedRequestHandler
      )
      .addRequestInterceptors(
        PostalCodeToLatLonDataLoadInterceptor,
        LogRequestInterceptor,
      )
      .addResponseInterceptors(
        LogResponseInterceptor)
      .addErrorHandlers(ErrorHandler)
      .withApiClient(new Alexa.DefaultApiClient())
      .create();
  }

  return skill.invoke(event, context);
};
