module.exports = (title, text, restroomDetails) => {
  const secondaryText = restroomDetails
    ? restroomDetails
    : "Please try again if I misheard you";
  return {
    bodyTemplate2Data: {
      type: "object",
      objectId: "bt2Sample",
      backgroundImage: {
        contentDescription: null,
        smallSourceUrl: null,
        largeSourceUrl: null,
        sources: [
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background.jpg",
            size: "small",
            widthPixels: 0,
            heightPixels: 0
          },
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background.jpg",
            size: "large",
            widthPixels: 0,
            heightPixels: 0
          }
        ]
      },
      title: "Welcome to Refugee Restrooms",
      image: {
        contentDescription: null,
        smallSourceUrl: null,
        largeSourceUrl: null,
        sources: [
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background.jpg",
            size: "small",
            widthPixels: 0,
            heightPixels: 0
          },
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background.jpg",
            size: "large",
            widthPixels: 0,
            heightPixels: 0
          }
        ]
      },
      textContent: {
        title: {
          type: "PlainText",
          text: `${title}`
        },
        primaryText: {
          type: "PlainText",
          text: text
        },
        secondaryText: {
          type: "PlainText",
          text: secondaryText
        }
      },
      logoUrl:
        "https://restrooms-alexa-skill.s3.amazonaws.com/512x512.png",
      hintText: `Try, "Alexa, ask Refugee Restrooms to find something near me"`
    }
  };
};
