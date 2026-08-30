import {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import { api } from "../services/api";

interface Drawing {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [drawings, setDrawings] =
    useState<Drawing[]>([]);

  const loadDrawings = async () => {
    const result =
      await api<{
        success: boolean;
        data: Drawing[];
      }>("/api/drawings");

    setDrawings(result.data);
  };

  useEffect(() => {
    loadDrawings();
  }, []);

  const createDrawing = async () => {
    const result =
      await api<{
        success: boolean;
        data: Drawing;
      }>("/api/drawings", {
        method: "POST",
        body: JSON.stringify({
          name: "Untitled",
          elements: [],
        }),
      });

    navigate(
      `/drawing/${result.data.id}`
    );
  };

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="dashboard">
      <header>
        <h1>My Drawings</h1>

        <button onClick={logout}>
          Logout
        </button>
      </header>

      <button
        className="create-button"
        onClick={createDrawing}
      >
        + New Drawing
      </button>

      <div className="drawing-list">
        {drawings.map((drawing) => (
          <div
            key={drawing.id}
            className="drawing-card"
            onClick={() =>
              navigate(
                `/drawing/${drawing.id}`
              )
            }
          >
            <h3>{drawing.name}</h3>

            <small>
              Updated{" "}
              {new Date(
                drawing.updatedAt
              ).toLocaleString()}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}