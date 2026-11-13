import { BrowserRouter, Route, Routes } from "react-router-dom";

function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-bold">FloodGuard AI</h1>
        <p className="mt-4 text-gray-600">
          Community flood-risk awareness and environmental hazard reporting.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Application foundation ready for development.
        </p>
      </div>
    </main>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
