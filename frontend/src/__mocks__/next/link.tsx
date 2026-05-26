import React from 'react'

const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
  <a href={href} {...props}>{children}</a>
)

export default Link
