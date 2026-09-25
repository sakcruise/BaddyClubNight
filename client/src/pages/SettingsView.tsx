import AdminPage from "../components/admin/AdminPage";
import ClubSettings from "../components/admin/ClubSettings";

export default function SettingsView() {
  return (
    <AdminPage title="Settings" subtitle="Club profile, nights, fees and theme" width="md">
      <ClubSettings />
    </AdminPage>
  );
}
