import AdminPage from "../components/admin/AdminPage";
import MemberManagement from "../components/admin/MemberManagement";

export default function MembersView() {
  return (
    <AdminPage title="Members" subtitle="Your club roster">
      <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm p-4 sm:p-6">
        <MemberManagement />
      </div>
    </AdminPage>
  );
}
