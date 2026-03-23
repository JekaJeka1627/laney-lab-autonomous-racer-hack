"""
Visual Explorer -- camera-only autonomous exploration with return-to-home.

Modules:
  obstacle_detector  -- MiDaS monocular depth + 3-sector obstacle classification
  breadcrumb_trail   -- Position trail recording for return-to-home navigation
  landmark_db        -- Visual landmark storage and place recognition (Phase 2)
  visual_odometry    -- ORB feature-based pose estimation (Phase 3)
  navigation_planner -- Explore / Return / Safety decision logic
  explorer_runtime   -- Main loop: camera -> plan -> actuate
  config             -- Explorer-specific configuration
"""
