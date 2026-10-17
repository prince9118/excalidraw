const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {}),
      ...(options.headers || {})
    }
  });

  // 204 No Content (e.g. DELETE) has no body to parse.
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  // An expired or invalid token can't be recovered from here,
  // so drop it and send the user back to log in.
  if (response.status === 401 && token) {
    localStorage.removeItem("token");
    window.location.assign("/login");
  }

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
};
