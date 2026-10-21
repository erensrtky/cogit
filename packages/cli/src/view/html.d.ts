/** `.html` imports are bundled as a string by tsup (`loader: { ".html": "text" }`). */
declare module "*.html" {
  const html: string;
  export default html;
}
