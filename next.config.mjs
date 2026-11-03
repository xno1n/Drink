export default { reactStrictMode: true, output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined };
