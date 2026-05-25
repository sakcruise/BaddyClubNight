import { useSessionStore } from "../store";
import SessionSetup from "../components/admin/SessionSetup";
import AdminSessionView from "./AdminSessionView";

export default function AdminView() {
  const { session } = useSessionStore();

  // No active session → show setup screen
  if (!session) return <SessionSetup />;

  // Active session → full 3-panel admin view
  return <AdminSessionView />;
}
