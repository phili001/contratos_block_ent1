import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { Layout } from "./components/Layout";
import "./index.css";
import { MilestonesPage } from "./pages/Milestones";
import { ProjectDetail } from "./pages/ProjectDetail";
import { ProjectsPage } from "./pages/Projects";
import { ReportPage } from "./pages/Report";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <ProjectsPage /> },
      { path: "/projects/:id", element: <ProjectDetail /> },
      { path: "/projects/:id/milestones", element: <MilestonesPage /> },
      { path: "/projects/:id/report", element: <ReportPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
