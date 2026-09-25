import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  verificar(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
