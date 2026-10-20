import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { PlayerProfile } from '@/modules/player/player.model';
import { User } from '@/modules/user/user.model';

/**
 * Parse timer formatted as min:sec (e.g. "08:08", "76:30") or numeric minutes
 */
export function parseTimerInput(payload: {
  timer?: any;
  matchTime?: any;
  matchDuration?: any;
  minutesPlayed?: any;
}): { minutesPlayed: number; matchDuration: string } {
  const raw = payload.timer ?? payload.matchTime ?? payload.matchDuration ?? payload.minutesPlayed;

  if (raw === undefined || raw === null || raw === '') {
    throw new AppError(
      400,
      'Match timer is strictly required in min:sec format (e.g. "08:08" or "76:30"). Please provide the exact timer value.',
    );
  }

  if (typeof raw === 'number') {
    if (raw <= 0) {
      throw new AppError(400, 'Match timer must be greater than 0.');
    }
    const mins = Math.floor(raw);
    const secs = Math.round((raw - mins) * 60);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return { minutesPlayed: Math.round(raw * 100) / 100, matchDuration: formatted };
  }

  const str = String(raw).trim();
  if (!str) {
    throw new AppError(
      400,
      'Match timer is strictly required in min:sec format (e.g. "08:08" or "76:30").',
    );
  }

  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      if (
        isNaN(mins) ||
        isNaN(secs) ||
        mins < 0 ||
        secs < 0 ||
        secs >= 60 ||
        (mins === 0 && secs === 0)
      ) {
        throw new AppError(
          400,
          'Invalid min:sec timer format. Format must be "mm:ss" (e.g. "08:08", "76:30") with seconds between 00-59 and time > 0.',
        );
      }
      const totalMinutes = Math.round((mins + secs / 60) * 100) / 100;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      return { minutesPlayed: totalMinutes, matchDuration: formatted };
    }
  }

  const parsedNum = parseFloat(str);
  if (isNaN(parsedNum) || parsedNum <= 0) {
    throw new AppError(
      400,
      'Invalid timer input. Format must be min:sec (e.g., "08:08" or "76:30").',
    );
  }
  const mins = Math.floor(parsedNum);
  const secs = Math.round((parsedNum - mins) * 60);
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return { minutesPlayed: Math.round(parsedNum * 100) / 100, matchDuration: formatted };
}

/**
 * Helper to resolve PlayerProfile by userId or auto-create it from Screen 1 playerInfo
 */
export async function resolveOrCreatePlayerProfile(userId: string, payload: any) {
  let playerProfile = null;

  if (userId && Types.ObjectId.isValid(userId)) {
    playerProfile = await PlayerProfile.findOne({
      $or: [{ userId: new Types.ObjectId(userId) }, { _id: new Types.ObjectId(userId) }],
    });
  }

  if (!playerProfile && payload?.playerId && Types.ObjectId.isValid(payload.playerId)) {
    playerProfile = await PlayerProfile.findById(payload.playerId);
  }

  if (!playerProfile && userId && Types.ObjectId.isValid(userId)) {
    const user = await User.findById(userId);
    if (user) {
      playerProfile = await PlayerProfile.create({
        userId: user._id,
        fullName: payload.playerInfo?.playerName || user.name || 'Player',
        dateOfBirth: payload.playerInfo?.dateOfBirth
          ? new Date(payload.playerInfo.dateOfBirth)
          : undefined,
        position: payload.playerInfo?.position || 'CM',
        preferredFoot: payload.playerInfo?.foot?.toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
        currentClub: payload.playerInfo?.clubName || 'Free Agent',
        weight: payload.playerInfo?.weight,
        height: payload.playerInfo?.height,
        playerStyles: payload.playerInfo?.characteristics || [],
      });
    }
  }

  if (!playerProfile) {
    throw new AppError(
      404,
      'Player profile not found for this user. Please ensure you are logged in as a valid player.',
    );
  }

  return playerProfile;
}
