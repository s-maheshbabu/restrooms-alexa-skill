const unitUnderTest = require("../../src/index");

const expect = require("chai").expect;
const importFresh = require('import-fresh');

const context = {};

describe("Tests for 'SessionResumedRequestHandler'", function () {
    it("should close the session without any prompts in the happy case.", async () => {
        const event = importFresh("../../test-data/requesthandlers/session_resumed_request_success");

        const responseContainer = await unitUnderTest.handler(event, context);
        const response = responseContainer.response;

        expect(response.shouldEndSession).to.be.true;
        const outputSpeech = response.outputSpeech;
        expect(outputSpeech).to.be.undefined;
    });

    it("should render an error message is launching an appLink fails.", async () => {
        const event = importFresh("../../test-data/requesthandlers/session_resumed_request_failure");

        const responseContainer = await unitUnderTest.handler(event, context);
        const response = responseContainer.response;

        expect(response.shouldEndSession).to.be.true;
        const outputSpeech = response.outputSpeech;
        expect(outputSpeech.ssml).to.equal(
            `<speak>Sorry, I couldn't load the directions. Please try again later.</speak>`
        );
    });
});