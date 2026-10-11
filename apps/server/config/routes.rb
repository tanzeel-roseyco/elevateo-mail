Rails.application.routes.draw do
  get "/health", to: "health#live"
  get "/ready", to: "health#ready"
end
