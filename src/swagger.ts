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
const endpointsFiles = [
  path.join(__dirname, 'app.ts'),
  path.join(__dirname, 'routes/index.ts'),
  path.join(__dirname, 'modules/user/user.routes.ts'),
  path.join(__dirname, 'modules/player/player.routes.ts'),
  path.join(__dirname, 'modules/coach/coach.routes.ts'),
  path.join(__dirname, 'modules/academy/academy.routes.ts'),
  path.join(__dirname, 'modules/club/club.routes.ts'),
  path.join(__dirname, 'modules/agent/agent.routes.ts'),
  path.join(__dirname, 'modules/parent/parent.routes.ts'),
  path.join(__dirname, 'modules/training/training.routes.ts'),
  path.join(__dirname, 'modules/chat/chat.routes.ts'),
  path.join(__dirname, 'modules/invoice/invoice.routes.ts'),
  path.join(__dirname, 'modules/shop/shop.routes.ts'),
  path.join(__dirname, 'modules/subscription/subscription.routes.ts'),
];

swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger documentation generated successfully at src/swagger.json');
});
