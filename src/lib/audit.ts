import { getOrm } from './db';
import { AuditLog, User, type AuditAction } from './entities';

/**
 * Registra una acción en el log de auditoría. Fire-and-forget: NO bloquea la
 * respuesta y captura su propio error (nunca deja una promesa colgada).
 * Usa un EntityManager fork propio para no interferir con la UoW del request.
 */
export function audit(data: {
  action: AuditAction;
  userName: string;
  userId?: string;
  orderId?: string;
  orderDisplayId?: number;
  details?: string;
  metadata?: Record<string, unknown>;
}): void {
  void (async () => {
    try {
      const orm = await getOrm();
      const em = orm.em.fork();
      const log = em.create(AuditLog, {
        action: data.action,
        userName: data.userName,
        user: data.userId ? em.getReference(User, data.userId) : undefined,
        orderId: data.orderId,
        orderDisplayId: data.orderDisplayId,
        details: data.details,
        metadata: data.metadata,
        createdAt: new Date(),
      });
      await em.persistAndFlush(log);
    } catch (err) {
      console.error('[Audit] Error:', (err as Error).message);
    }
  })();
}
