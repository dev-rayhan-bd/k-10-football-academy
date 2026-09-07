import { Router } from 'express';
import { UserRoutes } from '@/modules/user/user.routes';
import { PlayerRoutes } from '@/modules/player/player.routes';
import { CoachRoutes } from '@/modules/coach/coach.routes';
import { AcademyRoutes } from '@/modules/academy/academy.routes';
import { ClubRoutes } from '@/modules/club/club.routes';
import { AgentRoutes } from '@/modules/agent/agent.routes';
import { ParentRoutes } from '@/modules/parent/parent.routes';
import { TrainingRoutes } from '@/modules/training/training.routes';
import { ChatRoutes } from '@/modules/chat/chat.routes';
import { InvoiceRoutes } from '@/modules/invoice/invoice.routes';
import { ShopRoutes } from '@/modules/shop/shop.routes';
import { SubscriptionRoutes } from '@/modules/subscription/subscription.routes';

const router = Router();

const moduleRoutes = [
  { path: '/users', route: UserRoutes },
  { path: '/players', route: PlayerRoutes },
  { path: '/coaches', route: CoachRoutes },
  { path: '/academies', route: AcademyRoutes },
  { path: '/clubs', route: ClubRoutes },
  { path: '/agents', route: AgentRoutes },
  { path: '/parents', route: ParentRoutes },
  { path: '/trainings', route: TrainingRoutes },
  { path: '/chats', route: ChatRoutes },
  { path: '/invoices', route: InvoiceRoutes },
  { path: '/shop', route: ShopRoutes },
  { path: '/subscriptions', route: SubscriptionRoutes },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export const applicationRoutes = router;
