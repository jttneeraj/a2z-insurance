const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: `${ process.env.APP_NAME } App`,
            version: '1.0.0',
            description: `Simple ${process.env.APP_NAME} app`,
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                }
            }
        },
        servers: [
            {
                url: `http://localhost:${process.env.APP_PORT}`,
            },
        ],
    },
    apis: ['./routes/*.js'], // Path to the API routes folder (or you can specify individual files)
    apis: ['./controllers/*.js'], // Path to the API routes folder (or you can specify individual files)
};

const specs = swaggerJsdoc(options);

module.exports = specs;
