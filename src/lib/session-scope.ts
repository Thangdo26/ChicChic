import type { Prisma, Session } from "@prisma/client";
import { prisma } from "@/lib/db";

/** So sánh phiên đang gọi, tránh một lần xác minh chậm mở nhầm lượt CHILD mới hơn. */
export async function changeSessionScope(
  session: Pick<Session, "id" | "userId" | "scope" | "scopeVersion">,
  toScope: "ADULT" | "CHILD",
  childId: string | null,
  validate?: (tx: Prisma.TransactionClient) => Promise<boolean>,
  newToken?: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.session.updateMany({
      where: { id: session.id, userId: session.userId, scope: session.scope,
        scopeVersion: session.scopeVersion, expiresAt: { gt: new Date() } },
      data: { scope: toScope, scopeChildId: childId, scopeVersion: { increment: 1 }, reauthAt: null,
        ...(newToken ? { token: newToken } : {}) },
    });
    if (changed.count !== 1) return false;
    if (validate && !(await validate(tx))) throw new Error("SESSION_SCOPE_TARGET_CLOSED");
    await tx.sessionScopeEvent.create({ data: {
      sessionId: session.id, userId: session.userId, fromScope: session.scope,
      toScope, version: session.scopeVersion + 1,
    } });
    return true;
  });
}
