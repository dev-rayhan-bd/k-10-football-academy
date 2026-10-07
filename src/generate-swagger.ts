import swaggerAutogen from 'swagger-autogen';
import path from 'path';

const doc = {
  info: {
    title: 'K10 Football Academy Platform API',
    description: 'Complete API documentation for the K10 Football Academy Platform Backend',
    version: '1.0.0',
  },
  host: 'localhost:5000',
  basePath: '/api/v1',
  schemes: ['http', 'https'],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const outputFile = path.join(__dirname, 'swagger-auto.json');
const endpointsFiles = [path.join(__dirname, 'app.ts')];

swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger documentation automatically generated at src/swagger-auto.json');
});
