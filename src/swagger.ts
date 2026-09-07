import swaggerAutogen from 'swagger-autogen';
import path from 'path';

const doc = {
  info: {
    title: 'K10 Football Academy Platform API',
    description: 'Auto-generated API documentation for K10 Football Academy Backend',
    version: '1.0.0',
  },
  host: 'localhost:5000',
  schemes: ['http', 'https'],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      name: 'Authorization',
      in: 'header',
      description: 'Enter JWT token with Bearer prefix: Bearer <token>',
    },
  },
};

const outputFile = path.join(__dirname, 'swagger.json');
const endpointsFiles = [path.join(__dirname, 'routes/index.ts')];

swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger documentation generated successfully at src/swagger.json');
});
