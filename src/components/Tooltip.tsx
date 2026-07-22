import React, { useState } from "react";

import { motion, AnimatePresence } from "motion/react";



interface TooltipProps {

  children: React.ReactNode;

  content: string;

  position?: "top" | "bottom" | "left" | "right";

  align?: "start" | "center" | "end";

  disabled?: boolean;

}



export const Tooltip: React.FC<TooltipProps> = ({

  children,

  content,

  position = "top",

  align = "center",

  disabled = false,

}) => {

  const [active, setActive] = useState(false);



  if (disabled) {

    return <>{children}</>;

  }



  // Determine container placement offsets

  let placementClasses = "";

  // Horizontal anchoring for top/bottom tooltips (keeps them on-screen near edges).
  const horizontalAlign =
    align === "start"
      ? "left-0"
      : align === "end"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  switch (position) {

    case "top":

      placementClasses = `bottom-full ${horizontalAlign} mb-1.5`;

      break;

    case "bottom":

      placementClasses = `top-full ${horizontalAlign} mt-1.5`;

      break;

    case "left":

      placementClasses = "right-full top-1/2 -translate-y-1/2 mr-1.5";

      break;

    case "right":

      placementClasses = "left-full top-1/2 -translate-y-1/2 ml-1.5";

      break;

  }



  // Define dynamic arrow styles for perfect pixel-aligned borders

  const getArrowStyle = (isBorder: boolean) => {

    const styles: React.CSSProperties = {

      position: "absolute",

      width: 0,

      height: 0,

      borderStyle: "solid",

      borderWidth: "4px",

      borderColor: "transparent",

    };



    const offset = isBorder ? "100%" : "calc(100% - 1px)";

    const colorVar = isBorder ? "var(--border-color)" : "var(--bg-panel)";

    // Horizontal arrow anchor: point at the trigger (~16px in) when edge-aligned.
    const arrowLeft = align === "start" ? "16px" : align === "end" ? "auto" : "50%";
    const arrowRight = align === "end" ? "16px" : "auto";
    const arrowTranslateX = align === "center" ? "translateX(-50%)" : "";



    switch (position) {

      case "top":

        styles.top = offset;

        styles.left = arrowLeft;

        styles.right = arrowRight;

        styles.transform = arrowTranslateX;

        styles.borderTopColor = colorVar;

        break;

      case "bottom":

        styles.bottom = offset;

        styles.left = arrowLeft;

        styles.right = arrowRight;

        styles.transform = arrowTranslateX;

        styles.borderBottomColor = colorVar;

        break;

      case "left":

        styles.left = offset;

        styles.top = "50%";

        styles.transform = "translateY(-50%)";

        styles.borderLeftColor = colorVar;

        break;

      case "right":

        styles.right = offset;

        styles.top = "50%";

        styles.transform = "translateY(-50%)";

        styles.borderRightColor = colorVar;

        break;

    }

    return styles;

  };



  return (

    <div

      className="relative inline-flex"

      onMouseEnter={() => setActive(true)}

      onMouseLeave={() => setActive(false)}

      onFocus={() => setActive(true)}

      onBlur={() => setActive(false)}

    >

      {children}

      <AnimatePresence>

        {active && (

          <motion.div

            initial={{ opacity: 0, scale: 0.96, y: position === "top" ? 2 : position === "bottom" ? -2 : 0, x: position === "left" ? 2 : position === "right" ? -2 : 0 }}

            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}

            exit={{ opacity: 0, scale: 0.96 }}

            transition={{ duration: 0.1, ease: "easeOut" }}

            className={`absolute ${placementClasses} z-[300] pointer-events-none`}

          >

            <div className="relative bg-bg-panel border border-border-main text-text-main text-[8px] md:text-[9.5px] leading-none font-sans font-extrabold px-2 py-1 rounded-lg shadow-md flex items-center select-none whitespace-nowrap">

              <span dir="rtl">{content}</span>

             

              {/* Outer Arrow (Border) */}

              <div style={getArrowStyle(true)} />

             

              {/* Inner Arrow (Fill) */}

              <div style={getArrowStyle(false)} />

            </div>

          </motion.div>

        )}

      </AnimatePresence>

    </div>

  );

};