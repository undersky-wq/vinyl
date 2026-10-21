import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { configureHttpSecurity } from './shared/http-security';
import { configureSecurityAudit } from './shared/security-audit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  configureSecurityAudit(app);
  configureHttpSecurity(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(Number(process.env.BACKEND_PORT || 3001), '0.0.0.0');
}

bootstrap();
