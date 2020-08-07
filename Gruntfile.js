const grunt = require("grunt");
grunt.loadNpmTasks("grunt-aws-lambda");

grunt.initConfig({
  lambda_invoke: {
    default: {
      options: {
        file_name: "src/index.js",
        event: "test-data/launch_request_event.json"
      }
    }
  },
  lambda_deploy: {
    default: {
      options: {
        aliases: "beta",
        enableVersioning: true
      },
      arn: "arn:aws:lambda:us-east-1:837603326872:function:restrooms-alexa-skill"
    },
    prod: {
      options: {
        aliases: "prod",
        enableVersioning: true
      },
      arn: "arn:aws:lambda:us-east-1:837603326872:function:restrooms-alexa-skill"
    }
  },
  lambda_package: {
    default: {},
    prod: {}
  }
});

grunt.registerTask("deploy", [
  "lambda_package:default",
  "lambda_deploy:default"
]);
grunt.registerTask("deploy_prod", [
  "lambda_package:prod",
  "lambda_deploy:prod"
]);
