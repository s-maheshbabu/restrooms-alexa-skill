const unitUnderTest = require("../src/utilities");

const expect = require("chai").expect;
const assert = require("chai").assert;

const UnparseableError = require("../src/errors/UnparseableError");

describe("Street address sanitization tests", function () {
    it("should handle empty street address", async () => {
        const emptyStreetAddresses = ["", null, undefined];

        for (var index = 0; index < emptyStreetAddresses.length; index++) {
            const emptyStreetAddress = emptyStreetAddresses[index];

            const sanitizedAddress = unitUnderTest.sanitizeAddress(emptyStreetAddress);
            expect(sanitizedAddress).to.be.eql("");
        }
    });

    it("should handle address with 'oh' for 'zero'. Alexa tends to put 'oh' for numbers like 601 and so we need to handle that special case.", async () => {
        const rawAddress = "six oh one oh one union street"

        const sanitizedAddress = unitUnderTest.sanitizeAddress(rawAddress);
        expect(sanitizedAddress).to.be.eql("60101 union street");
    });

    it("should santize valid addresses", async () => {
        const dataset =
            [
                ["six zero one union street", "601 union street"],
                ["five forty seven roy street", "547 roy street"],
                ["menchies yogurt nine seventy four cherry avenue", "menchies yogurt 974 cherry avenue"],
            ];

        for (var index = 0; index < dataset.length; index++) {
            const raw = dataset[index][0];
            const expectedSanitizedAddress = dataset[index][1];

            const actualSanitizedAddress = unitUnderTest.sanitizeAddress(raw);
            expect(expectedSanitizedAddress).to.be.eql(actualSanitizedAddress);
        }
    });

    it("Addresses that contain numbered streets or avenues cannot be parsed. For example, 'two one forty eighth avenue could be 21 48th or 2 148th or 2140 8th'. ", async () => {
        const dataset =
            [
                "twenty one twenty one seventh avenue",
                "menchies yogurt nine seventy fourth cherry avenue",
                "two one two one thirteenth road",
                "three one one one forty eighth avenue",
                "forty two eight seventy three on eighth and rose",
                "two sixteen K twenty fourth avenue",
            ];

        for (var index = 0; index < dataset.length; index++) {
            const raw = dataset[index];
            try {
                await unitUnderTest.sanitizeAddress(raw);
                assert.fail('Expected an error to be thrown');
            } catch (error) {
                assert(error instanceof UnparseableError);
            }
        }
    });
});
