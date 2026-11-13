/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ship the knowledge files with the chat function so it can read them at runtime.
  outputFileTracingIncludes: { "/api/chat": ["./knowledge/**/*"] },
  async headers() {
    return [
      {
        // The embed page is loaded in an iframe on permaloc.com (and anywhere the widget is tested).
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${process.env.ALLOWED_FRAME_ANCESTORS || "*"}` }],
      },
      {
        source: "/widget.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=300" }],
      },
    ];
  },
};
export default nextConfig;
