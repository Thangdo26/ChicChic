export const dynamic = "force-dynamic";
import { getSessionUser } from "@/lib/auth";
import ChooseBarnForm from "@/components/ChooseBarnForm";

export default async function ChooseBarn() {
  const me = await getSessionUser();
  return <ChooseBarnForm me={me ? { email: me.email, name: me.name } : null} />;
}
