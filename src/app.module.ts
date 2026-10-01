import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { InventoryModule } from './inventory/inventory.module';
import { CalculatorModule } from './calculator/calculator.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ImportsModule } from './imports/imports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') as any },
      }),
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    InventoryModule,
    CalculatorModule,
    QuotationsModule,
    ImportsModule,
    DashboardModule,
    CatalogModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
