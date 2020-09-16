const nodemailer = require("nodemailer");
let AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });

const FROM_ADDRESS = "s.maheshbabu@hotmail.com";
const SUBJECT_LINE = "Refugee Restrooms";

const MAXIMUM_RESULTS = 10;

// Nodemailer SES transporter
let transporter;

async function sendEmail(toAddress, zipcode, restrooms) {
    // Disable emails for now.
    // return;
    // TODO Properly validate the toAddress.
    if (!toAddress) return;

    let info = await transporter.sendMail({
        from: FROM_ADDRESS,
        to: toAddress,
        subject: SUBJECT_LINE,
        html: buildBody(zipcode, restrooms.slice(0, MAXIMUM_RESULTS)),
    });
    console.log(`Email sent. Id: ${info.messageId}.`);

    // What happens if sending email fails?
}

function buildBody(zipcode, restrooms) {
    let body = `<b>Hello,<br/>
Here are some restrooms ${zipcode ? `at ${zipcode}` : `near you`}.</b><br/>`

    restrooms.forEach(restroom => {
        body += `<hr />
    <b>${restroom.name}</b><br/>
    Address: ${restroom.street}, ${restroom.city}, ${restroom.state}<br/>
    Directions: <a href="https://www.google.com/maps/dir/?api=1&destination=${restroom.latitude},${restroom.longitude}">Google Maps</a><br/>
    Notes: ${restroom.directions ? `${restroom.directions}` : `Not Available`}<br/>
    Gender Neutral: ${restroom.unisex ? '&\#9989;' : '&\#10060;'}, Accessible: ${restroom.accessible ? '&\#9989;' : '&\#10060;'}, Changing Table: ${restroom.changing_table ? '&\#9989;' : '&\#10060;'}<br/>
    `
    });

    body += `The Google Maps links above are based on latitude/longitude of the restroom. It should take you very close to the destination but you might then want to use the restroom name and address to actually locate it.`;
    return body;
}
const init = (input) => {
    return new Promise((resolve, reject) => {
        if (input) {
            // TODO: Hack for testing. Needs to be fixed.
            transporter = input;
            resolve();
        }
        else if (!transporter) {
            console.log("Creating NodeMailer SES transporter.");
            transporter = nodemailer.createTransport({
                SES: new AWS.SES({
                    apiVersion: '2010-12-01'
                })
            });
            resolve();
        } else {
            resolve();
        }
    });
};

module.exports = {
    init: init,
    sendEmail: sendEmail,
};