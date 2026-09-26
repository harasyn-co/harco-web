declare module "virtual:site-version" {
  import type { ComponentType } from "react"
  const App: ComponentType
  export default App
}

/** Whether the articles (/experiments) are in this build. */
declare const __ARTICLES__: boolean
