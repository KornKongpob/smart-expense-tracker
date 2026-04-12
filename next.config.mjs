const nextConfig = {
  async redirects() {
    return [
      {
        source: "/add-transaction",
        destination: "/add",
        permanent: true,
      },
      {
        source: "/budgets",
        destination: "/planner",
        permanent: true,
      },
      {
        source: "/recurring",
        destination: "/planner",
        permanent: true,
      },
      {
        source: "/stats",
        destination: "/planner",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
