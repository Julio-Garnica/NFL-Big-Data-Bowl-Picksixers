import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SteelersProvider } from './steelers'
import { ThemeProvider } from './theme'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><SteelersProvider><App /></SteelersProvider></ThemeProvider></React.StrictMode>)

