import AdminPage from "../components/admin/AdminPage";
import PaymentsPanel from "../components/admin/PaymentsPanel";

export default function FinanceView() {
  return (
    <AdminPage title="Finance" subtitle="Membership dues, guest fees and the ledger">
      <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm p-4 sm:p-6">
        <PaymentsPanel />
      </div>
    </AdminPage>
  );
}
