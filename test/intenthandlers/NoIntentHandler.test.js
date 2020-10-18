const unitUnderTest = require("../../src/index");

const expect = require("chai").expect;
const importFresh = require('import-fresh');

const context = {};

describe("Invalid cases for 'NoIntentHandler'", function () {
    it("should render an error message if state is missing or invalid in the session attributes.", async () => {
        const event = importFresh("../../test-data/intenthandlers/no_android");
        invalidStates = [null, undefined, 'any-state-that-not-offering-directions'];

        for (var i = 0; i < invalidStates.length; i++) {
            const state = invalidStates[i];
            event.session.attributes.state = state;

            const responseContainer = await unitUnderTest.handler(event, context);
            const response = responseContainer.response;

            expect(response.shouldEndSession).to.be.true;
            const outputSpeech = response.outputSpeech;
            expect(outputSpeech.ssml).to.equal(
                `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
            );
            expect(outputSpeech.type).to.equal("SSML");
        }
    });

    it("should close the session without any prompts in the happy case.", async () => {
        const event = importFresh("../../test-data/intenthandlers/no_android");

        const responseContainer = await unitUnderTest.handler(event, context);
        const response = responseContainer.response;

        expect(response.shouldEndSession).to.be.true;
        const outputSpeech = response.outputSpeech;
        expect(outputSpeech).to.be.undefined;
    });
});