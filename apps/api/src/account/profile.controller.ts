import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { type Profile, ProfileUpdate } from '@mvp/shared';
import { parseBody } from '../common/parse-body';
import { CurrentUser, SessionGuard, type SessionUser } from '../auth/session.guard';
import { ProfileService } from './profile.service';

// The signed-in Customer's own profile. Email changes are not offered here.
@Controller('profile')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<Profile> {
    return this.profiles.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Profile> {
    return this.profiles.update(user.id, parseBody(ProfileUpdate, body));
  }
}
