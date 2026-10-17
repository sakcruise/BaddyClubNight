import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MyGroupsList from "../components/groups/MyGroupsList";

/** One login, one list of everything you belong to. */
export default function MySpacesView() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#faf8f6] pb-10">
      <div className="bg-white border-b border-[#eadfd6] px-5 pt-12 pb-3.5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="p-1 -ml-1 text-gray-500"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-semibold text-gray-900">Your groups &amp; clubs</h1>
      </div>
      <div className="px-5 pt-4"><MyGroupsList /></div>
    </div>
  );
}
