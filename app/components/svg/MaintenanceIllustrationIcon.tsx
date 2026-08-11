type MaintenanceIllustrationIconProps = {
  className?: string;
  height?: number;
  width?: number;
};

export function MaintenanceIllustrationIcon({
  className,
  height = 300,
  width = 400,
}: MaintenanceIllustrationIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      height={`${height}px`}
      width={`${width}px`}
      aria-hidden="true"
      focusable="false"
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        <g fill="none" stroke="#dedede" strokeWidth="4">
          <path d="M47 181v99M122 181v99M197 181v99" />
          <path d="m47 184 75 47 75-47M47 232l75 48 75-48" />
          <path d="m47 280 75-49 75 49" />
        </g>

        <path
          d="m146 12 9-8 184 194-11 11Z"
          fill="#d5d5d5"
          stroke="#9b9b9b"
          strokeWidth="4"
        />
        <path d="m214 70 10-10" fill="none" stroke="#949494" strokeWidth="5" />
        <path d="m277 137 10-10" fill="none" stroke="#949494" strokeWidth="5" />

        <path d="M148 12v61" fill="none" stroke="#9b9b9b" strokeWidth="4" />
        <circle cx="148" cy="36" r="5" fill="#9b9b9b" />
        <path d="M111 73h74" fill="none" stroke="#4546f4" strokeWidth="7" />

        <path
          d="M49 87h148v94H49Z"
          fill="#fff"
          stroke="#aaa"
          strokeWidth="7"
        />
        <path d="M66 105h55v16H66Z" fill="#4546f4" />
        <g fill="#e5e5e5">
          <path d="M128 105h17v17h-17zM151 105h17v17h-17zM174 105h17v17h-17z" />
          <path d="M128 129h17v17h-17zM151 129h17v17h-17zM174 129h17v17h-17z" />
          <path d="M128 153h17v18h-17zM151 153h17v18h-17z" />
        </g>
        <path d="M174 153h17v18h-17Z" fill="#ff7800" />
        <g fill="#dedede">
          <path d="M66 130h55v5H66zM66 140h55v5H66zM66 150h55v5H66zM66 160h55v5H66z" />
        </g>
        <path d="M24 181h198" fill="none" stroke="#939393" strokeWidth="9" />

        <path
          d="M303 219v-11c0-12 9-21 21-21h24v55h-45Z"
          fill="#fff"
          stroke="#aaa"
          strokeWidth="5"
        />
        <path d="M319 191h17v26h-17Z" fill="#d9d9d9" />
        <path d="M331 207h15v14h-15Z" fill="#4546f4" />
        <path d="M324 207h9v14h-9Z" fill="#e1c72d" />

        <path
          d="M204 249v-25c0-14 11-25 25-25h34v54h-39l-10 12h-25v-16Z"
          fill="#fff"
          stroke="#a6a6a6"
          strokeWidth="5"
        />
        <path d="M220 203h16v26h-16Z" fill="#e2e2e2" />
        <path d="M240 203h19v27h-19Z" fill="#a3a3a3" />
        <path d="M246 217h15v14h-15Z" fill="#4546f4" />
        <path d="M239 217h9v14h-9Z" fill="#e1c72d" />

        <path d="M185 245h18v20h-18Z" fill="#777" />
        <path d="M189 249h10v4h-10Z" fill="#e1c72d" />
        <path d="M189 255h7v3h-7Z" fill="#bdbdbd" />
        <path
          d="M199 252h68v-13h39v10h55v29H199Z"
          fill="#777"
        />
        <path d="M196 271h173" fill="none" stroke="#777" strokeWidth="8" />
        <path d="M360 264h17" fill="none" stroke="#777" strokeWidth="6" />

        <g>
          <circle cx="236" cy="274" r="21" fill="#777" />
          <circle cx="236" cy="274" r="12" fill="#aaa" />
          <circle cx="333" cy="274" r="21" fill="#777" />
          <circle cx="333" cy="274" r="12" fill="#aaa" />
        </g>

        <path d="M22 292h356" fill="none" stroke="#898989" strokeWidth="5" />
      </g>
    </svg>
  );
}
