import { Types } from 'mongoose';
import { CoachProfile } from '@/modules/coach/coach.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';

/**
 * Chat display identity. The real name and picture live on the role profile
 * (CoachProfile.fullName / profileImage, AcademyProfile.name / logo, ...), not on the User
 * account, which can hold stale values. Profile values win; the User account is the fallback.
 */

// Images from the retired Cloudinary account no longer load (same rule as the coach list).
const RETIRED_IMAGE_HOSTS = ['da1uxchgo'];
export const cleanImageUrl = (url?: string | null): string =>
  url && !RETIRED_IMAGE_HOSTS.some((h) => url.includes(h)) ? url : '';

export type DisplayIdentity = { name: string; avatar: string };

const idStr = (v: unknown) => (v ? String((v as any)._id || v) : '');

/** Map userId → { name, avatar } from the users' role profiles. */
export const getDisplayMap = async (
  userIds: Array<string | Types.ObjectId>,
): Promise<Map<string, DisplayIdentity>> => {
  const ids = [...new Set(userIds.map(idStr).filter((id) => Types.ObjectId.isValid(id)))].map(
    (id) => new Types.ObjectId(id),
  );
  const map = new Map<string, DisplayIdentity>();
  if (!ids.length) return map;

  const filter = { userId: { $in: ids } };
  const [coaches, players, academies, clubs, agents] = await Promise.all([
    CoachProfile.find(filter).select('userId fullName profileImage').lean(),
    PlayerProfile.find(filter).select('userId fullName profileImage').lean(),
    AcademyProfile.find(filter).select('userId name logo').lean(),
    ClubProfile.find(filter).select('userId name logo').lean(),
    AgentProfile.find(filter).select('userId fullName name avatar').lean(),
  ]);

  const put = (userId: unknown, name?: string, avatar?: string) => {
    const key = idStr(userId);
    if (!key || map.has(key)) return;
    map.set(key, { name: (name || '').trim(), avatar: cleanImageUrl(avatar) });
  };
  (coaches as any[]).forEach((p) => put(p.userId, p.fullName, p.profileImage));
  (players as any[]).forEach((p) => put(p.userId, p.fullName, p.profileImage));
  (academies as any[]).forEach((p) => put(p.userId, p.name, p.logo));
  (clubs as any[]).forEach((p) => put(p.userId, p.name, p.logo));
  (agents as any[]).forEach((p) => put(p.userId, p.fullName || p.name, p.avatar));
  return map;
};

/** Resolved name/avatar for a (populated) user: profile first, then the User account. */
export const displayOf = (map: Map<string, DisplayIdentity>, user: any): DisplayIdentity => {
  const profile = map.get(idStr(user));
  return {
    name: profile?.name || user?.name || user?.fullName || '',
    avatar: profile?.avatar || cleanImageUrl(user?.avatar),
  };
};

/** userIds whose profile name matches the search (so contacts can be found by profile name). */
export const findUserIdsByProfileName = async (escapedTerm: string): Promise<Types.ObjectId[]> => {
  const rx = { $regex: escapedTerm, $options: 'i' };
  const [coaches, players, academies, clubs, agents] = await Promise.all([
    CoachProfile.find({ fullName: rx }).distinct('userId'),
    PlayerProfile.find({ fullName: rx }).distinct('userId'),
    AcademyProfile.find({ name: rx }).distinct('userId'),
    ClubProfile.find({ name: rx }).distinct('userId'),
    AgentProfile.find({ $or: [{ fullName: rx }, { name: rx }] }).distinct('userId'),
  ]);
  return [...coaches, ...players, ...academies, ...clubs, ...agents].filter(Boolean) as any;
};
