import { api } from "./api";

interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: {
      id: string;
      email: string;
    };
  };
}

export async function logIn(email: string, password: string) {
  const result = await api<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  localStorage.setItem("token", result.data.token);
}
